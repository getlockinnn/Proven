import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { CreateProofProxyUploadSchema, CreateSignedUploadSchema } from '../schemas/submission';
import { supabase, SUPABASE_URL_VALUE } from '../lib/supabase';

// Admin allowlist from environment variable
const getAdminEmails = (): Set<string> => {
  const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
  const emails = adminEmailsEnv.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  // Fallback for development if not set
  if (emails.length === 0 && process.env.NODE_ENV === 'development') {
    return new Set(['hello@proven.com']);
  }
  return new Set(emails);
};
const ADMIN_EMAILS = getAdminEmails();
const SUPPORTED_PROOF_CONTENT_TYPE = /^image\/(png|jpeg|jpg|webp)$/i;
const MAX_PROOF_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB raw image payload

const router = Router();

function resolveProofExtension(contentType: string): 'png' | 'webp' | 'jpg' {
  const lowered = contentType.toLowerCase();
  if (lowered.includes('png')) return 'png';
  if (lowered.includes('webp')) return 'webp';
  return 'jpg';
}

function buildProofPath(userId: string, challengeId: string, ext: string): string {
  const ts = Date.now();
  const today = new Date();
  const dateFolder = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getFullYear()).slice(-2)}`; // DD-MM-YY
  const userIdShort = userId.slice(-8);
  const challengeIdShort = challengeId.slice(-8);
  return `${dateFolder}/${userIdShort}-${challengeIdShort}-${ts}.${ext}`;
}

// GET /api/storage/proof/public-base
// Returns the public storage base URL for constructing proof image URLs client-side.
router.get('/proof/public-base', (_req, res) => {
  if (!SUPABASE_URL_VALUE) {
    res.status(500).json({ success: false, message: 'Storage not configured' });
    return;
  }
  res.json({
    success: true,
    data: {
      baseUrl: `${SUPABASE_URL_VALUE}/storage/v1/object/public/proof-submission/`,
    },
  });
});

// GET /api/storage/proof?path=<storage_path>
// Returns the image bytes for a private proof submission.
router.get('/proof', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const path = req.query.path as string | undefined;
    if (!path) {
      res.status(400).json({ success: false, message: 'Missing path query param' });
      return;
    }

    // Basic access check: ensure the path contains the authenticated user's id (last 8 chars)
    // Our uploader saves as: <dateFolder>/<userIdShort>-<challengeIdShort>-<timestamp>.<ext>
    const userIdShort = req.user?.id.slice(-8);
    const userIdPattern = `/${userIdShort}-`;
    const isAdmin = req.user?.email ? ADMIN_EMAILS.has(req.user.email) : false;
    if (!isAdmin && !path.includes(userIdPattern)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const { data, error } = await supabase.storage
      .from('proof-submission')
      .download(path);

    if (error || !data) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    // data is a Blob in Node 18+. Set content type if known
    const contentType = (data as any).type || 'application/octet-stream';
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    // eslint-disable-next-line no-console
    res.status(500).json({ success: false, message: 'Failed to fetch image' });
  }
});

// POST /api/storage/proof/signed-upload
// Returns a one-time signed upload URL and canonical storage path
router.post('/proof/signed-upload', authenticate, validateRequest(CreateSignedUploadSchema), async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const { challengeId, contentType } = req.body as { challengeId: string; contentType: string };
    const userId = req.user!.id;

    // Validate mime type roughly (client should also validate before calling)
    if (!SUPPORTED_PROOF_CONTENT_TYPE.test(contentType)) {
      res.status(400).json({ success: false, message: 'Unsupported content type' });
      return;
    }

    const ext = resolveProofExtension(contentType);
    const path = buildProofPath(userId, challengeId, ext);

    // Supabase Storage v2 provides createSignedUploadUrl on the Storage API
    // For compatibility, we fallback to upload tokens via signed POST if available
    // Some client versions accept just the path; if your SDK variant uses options, adjust accordingly
    const { data, error } = await supabase.storage
      .from('proof-submission')
      .createSignedUploadUrl(path); // default TTL
    if (error || !data) {
      res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
      return;
    }

    res.json({ success: true, data: { path, signedUrl: data.signedUrl, token: (data as any).token } });
  } catch (err) {
    // eslint-disable-next-line no-console
    res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
  }
});

// POST /api/storage/proof/upload
// Server-side upload fallback for mobile clients that cannot reach signed upload URLs.
router.post('/proof/upload', authenticate, validateRequest(CreateProofProxyUploadSchema), async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const { challengeId, contentType, imageBase64 } = req.body as {
      challengeId: string;
      contentType: string;
      imageBase64: string;
    };

    if (!SUPPORTED_PROOF_CONTENT_TYPE.test(contentType)) {
      res.status(400).json({ success: false, message: 'Unsupported content type' });
      return;
    }

    const normalizedBase64 = imageBase64.includes(',')
      ? imageBase64.split(',').pop() || ''
      : imageBase64;

    const buffer = Buffer.from(normalizedBase64, 'base64');
    if (!buffer.length) {
      res.status(400).json({ success: false, message: 'Invalid image payload' });
      return;
    }
    if (buffer.length > MAX_PROOF_UPLOAD_BYTES) {
      res.status(413).json({ success: false, message: 'Image too large. Please upload a smaller image.' });
      return;
    }

    const ext = resolveProofExtension(contentType);
    const path = buildProofPath(req.user!.id, challengeId, ext);

    const { error } = await supabase.storage
      .from('proof-submission')
      .upload(path, buffer, {
        contentType,
        upsert: false,
        cacheControl: '3600',
      });

    if (error) {
      console.error('Proof proxy upload error:', error);
      res.status(500).json({ success: false, message: 'Failed to upload proof image' });
      return;
    }

    res.json({ success: true, data: { path } });
  } catch (err) {
    console.error('Proof proxy upload exception:', err);
    res.status(500).json({ success: false, message: 'Failed to upload proof image' });
  }
});

// POST /api/storage/proof/signed-preview
// Returns a signed URL for previewing an uploaded proof image
router.post('/proof/signed-preview', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const { path } = req.body as { path: string };
    if (!path) {
      res.status(400).json({ success: false, message: 'Missing path in request body' });
      return;
    }

    // Generate signed URL (1 hour expiry)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('proof-submission')
      .createSignedUrl(path, 3600); // 1 hour = 3600 seconds

    if (signedError || !signedData) {
      console.error('Signed URL generation error:', signedError);
      res.status(404).json({ success: false, message: 'Failed to generate preview URL. File may not exist.' });
      return;
    }

    res.json({ success: true, data: { signedUrl: signedData.signedUrl } });
  } catch (err) {
    console.error('Signed preview error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate preview URL' });
  }
});

// POST /api/storage/profile-image/signed-upload
// Returns a one-time signed upload URL for user profile images.
router.post('/profile-image/signed-upload', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const { contentType } = req.body as { contentType: string };
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(contentType)) {
      res.status(400).json({ success: false, message: 'Unsupported content type. Use PNG, JPEG, WebP, or GIF.' });
      return;
    }

    const ext = contentType.toLowerCase().includes('png') ? 'png'
      : contentType.toLowerCase().includes('webp') ? 'webp'
        : contentType.toLowerCase().includes('gif') ? 'gif'
          : 'jpg';
    const ts = Date.now();
    const userIdShort = req.user!.id.slice(-8);
    const path = `profiles/${userIdShort}-${ts}.${ext}`;

    // Reuse challenge-image bucket because it is already public and configured.
    const { data, error } = await supabase.storage
      .from('challenge-image')
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error('Profile image signed upload error:', error);
      res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('challenge-image')
      .getPublicUrl(path);

    res.json({
      success: true,
      data: {
        path,
        signedUrl: data.signedUrl,
        token: (data as any).token,
        publicUrl,
      },
    });
  } catch (err) {
    console.error('Profile image signed upload exception:', err);
    res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
  }
});

// POST /api/storage/challenge-image/signed-upload
// Returns a one-time signed upload URL for challenge cover images (admin only)
router.post('/challenge-image/signed-upload', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!supabase) {
      res.status(500).json({ success: false, message: 'Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    // Admin-only check
    const isAdmin = req.user?.email ? ADMIN_EMAILS.has(req.user.email.toLowerCase()) : false;
    if (!isAdmin && !req.user?.isAdmin) {
      res.status(403).json({ success: false, message: 'Admin access required' });
      return;
    }

    const { contentType, filename } = req.body as { contentType: string; filename?: string };

    // Validate mime type
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(contentType)) {
      res.status(400).json({ success: false, message: 'Unsupported content type. Use PNG, JPEG, WebP, or GIF.' });
      return;
    }

    const ext = contentType.toLowerCase().includes('png') ? 'png'
      : contentType.toLowerCase().includes('webp') ? 'webp'
        : contentType.toLowerCase().includes('gif') ? 'gif'
          : 'jpg';
    const ts = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const path = `challenges/${randomId}-${ts}.${ext}`;

    // Create signed upload URL
    const { data, error } = await supabase.storage
      .from('challenge-image')
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error('Challenge image upload URL error:', error);
      res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
      return;
    }

    // Also generate the public URL for after upload
    const { data: { publicUrl } } = supabase.storage
      .from('challenge-image')
      .getPublicUrl(path);

    res.json({
      success: true,
      data: {
        path,
        signedUrl: data.signedUrl,
        token: (data as any).token,
        publicUrl
      }
    });
  } catch (err) {
    console.error('Challenge image signed upload error:', err);
    res.status(500).json({ success: false, message: 'Failed to create signed upload URL' });
  }
});

export default router;
