import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "./api/client";

interface ImageUploadProps {
    value?: string;
    onChange: (url: string) => void;
    className?: string;
}

interface SignedUploadResponse {
    success: boolean;
    data?: {
        path: string;
        signedUrl: string;
        token?: string;
        publicUrl: string;
    };
    message?: string;
}

export function ImageUpload({ value, onChange, className }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            setError("Please upload an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("File size must be less than 5MB");
            return;
        }

        setError(null);
        setIsUploading(true);

        try {
            // 1. Get signed upload URL from backend
            const { data: apiResponse } = await apiClient.post<SignedUploadResponse>(
                "/storage/challenge-image/signed-upload",
                { contentType: file.type, filename: file.name }
            );

            if (!apiResponse.success || !apiResponse.data) {
                throw new Error(apiResponse.message || "Failed to get upload URL");
            }

            const { signedUrl, publicUrl, token } = apiResponse.data;

            // 2. Upload directly to Supabase Storage using signed URL
            const uploadResponse = await fetch(signedUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": file.type,
                    ...(token ? { "x-upsert": "true" } : {}),
                },
                body: file,
            });

            if (!uploadResponse.ok) {
                throw new Error("Failed to upload image");
            }

            // 3. Return public URL
            onChange(publicUrl);
        } catch (err: any) {
            console.error("Upload error:", err);
            setError(err.message || "Failed to upload image");
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            uploadFile(file);
        }
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            uploadFile(file);
        }
    }, []);

    const handleRemove = () => {
        onChange("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    if (value) {
        return (
            <div className={cn("relative group", className)}>
                <div className="relative rounded-lg overflow-hidden border border-border h-40">
                    <img
                        src={value}
                        alt="Challenge cover"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="p-2 bg-destructive rounded-full text-white hover:bg-destructive/90"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />
            <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    isDragging
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-secondary/50",
                    isUploading && "pointer-events-none opacity-60"
                )}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-sm text-muted-foreground">Uploading...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-3 rounded-full bg-secondary">
                            <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Click to upload or drag & drop
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                PNG, JPG, WebP up to 5MB
                            </p>
                        </div>
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
    );
}
