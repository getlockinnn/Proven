import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';

type SupportType = 'help' | 'contact' | 'terms' | 'privacy';

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  type: SupportType;
}

const getTitle = (type: SupportType) => {
  switch (type) {
    case 'help': return 'Help Center';
    case 'contact': return 'Contact Us';
    case 'terms': return 'Terms & Conditions';
    case 'privacy': return 'Privacy Policy';
  }
};

export function SupportModal({ 
  visible, 
  onClose, 
  type 
}: SupportModalProps) {
  const insets = useSafeAreaInsets();
  
  const renderContent = () => {
    switch (type) {
      case 'help':
        return <HelpContent />;
      case 'contact':
        return <ContactContent />;
      case 'terms':
        return <TermsContent />;
      case 'privacy':
        return <PrivacyContent />;
    }
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerButton} />
          <Text style={styles.headerTitle}>{getTitle(type)}</Text>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.provenDark} />
          </Pressable>
        </View>
        
        {/* Content */}
        <View style={styles.contentContainer}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
}

// Help Content Component
function HelpContent() {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <FAQItem 
        question="How do I join a challenge?"
        answer="Browse available challenges on the Home or Challenges tab. Tap on a challenge to see details, then tap 'Join Challenge' and confirm your stake amount."
      />
      <FAQItem 
        question="How do I prove my progress?"
        answer="Once you've joined a challenge, tap 'Prove' to submit photo or video evidence of completing your daily task. Our community verification system will review your submission."
      />
      <FAQItem 
        question="What happens if I miss a day?"
        answer="Missing a day means you forfeit your stake for that challenge. The forfeited stakes are distributed among participants who complete all requirements."
      />
      <FAQItem 
        question="How do I withdraw my earnings?"
        answer="Go to your Profile, tap on Transaction History, and select 'Withdraw'. Connect your payment method and request a withdrawal. Processing takes 1-3 business days."
      />
      <FAQItem 
        question="Is my data secure?"
        answer="Yes! We use industry-standard encryption to protect your personal information and payment details. See our Privacy Policy for more details."
      />
    </ScrollView>
  );
}

// Contact Content Component
function ContactContent() {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ContactOption 
        icon="mail"
        title="Email Support"
        description="Get help via email"
        action={process.env.EXPO_PUBLIC_SUPPORT_EMAIL!}
        onPress={() => Linking.openURL(`mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL}`)}
      />
      <ContactOption
        icon="logo-twitter"
        title="Twitter"
        description="Follow us & DM for support"
        action="@ProvenApp"
        onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TWITTER_URL!)}
      />
      <ContactOption
        icon="logo-discord"
        title="Discord Community"
        description="Join our community"
        action="discord.gg/proven"
        onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_DISCORD_URL!)}
      />
      <View style={styles.responseTime}>
        <Ionicons name="time-outline" size={16} color={colors.textMuted} />
        <Text style={styles.responseTimeText}>
          Average response time: 24 hours
        </Text>
      </View>
    </ScrollView>
  );
}

// Terms Content Component
function TermsContent() {
  return (
    <ScrollView style={styles.legalScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.legalHeading}>1. Acceptance of Terms</Text>
      <Text style={styles.legalText}>
        By accessing or using Proven, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
      </Text>
      
      <Text style={styles.legalHeading}>2. Challenge Participation</Text>
      <Text style={styles.legalText}>
        When you join a challenge, you agree to stake the specified amount. Stakes are non-refundable once a challenge begins, except in cases of technical errors on our part.
      </Text>
      
      <Text style={styles.legalHeading}>3. Proof Submission</Text>
      <Text style={styles.legalText}>
        All proof submissions must be genuine and accurately represent your completion of the challenge requirements. Fraudulent submissions will result in immediate disqualification and potential account suspension.
      </Text>
      
      <Text style={styles.legalHeading}>4. Rewards & Payouts</Text>
      <Text style={styles.legalText}>
        Rewards are calculated based on the total stake pool and distributed among successful participants. Proven retains a 10% platform fee from the total prize pool.
      </Text>
      
      <Text style={styles.legalHeading}>5. Account Termination</Text>
      <Text style={styles.legalText}>
        We reserve the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.
      </Text>
      
      <Text style={styles.legalDate}>Last updated: January 2024</Text>
    </ScrollView>
  );
}

// Privacy Content Component
function PrivacyContent() {
  return (
    <ScrollView style={styles.legalScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.legalHeading}>Information We Collect</Text>
      <Text style={styles.legalText}>
        We collect information you provide directly, including your name, email address, profile picture, and payment information. We also collect proof submissions (photos/videos) that you submit for challenges.
      </Text>
      
      <Text style={styles.legalHeading}>How We Use Your Information</Text>
      <Text style={styles.legalText}>
        • To provide and improve our services{'\n'}
        • To process challenge participation and rewards{'\n'}
        • To communicate with you about your account{'\n'}
        • To ensure fair play and prevent fraud{'\n'}
        • To personalize your experience
      </Text>
      
      <Text style={styles.legalHeading}>Data Security</Text>
      <Text style={styles.legalText}>
        We implement industry-standard security measures to protect your personal information. Payment processing is handled by trusted third-party providers (Stripe) who maintain PCI compliance.
      </Text>
      
      <Text style={styles.legalHeading}>Data Sharing</Text>
      <Text style={styles.legalText}>
        We do not sell your personal information. We may share data with service providers who assist in operating our platform, and when required by law.
      </Text>
      
      <Text style={styles.legalHeading}>Your Rights</Text>
      <Text style={styles.legalText}>
        You can request access to, correction of, or deletion of your personal data by contacting us at privacy@provenapp.com.
      </Text>
      
      <Text style={styles.legalDate}>Last updated: January 2024</Text>
    </ScrollView>
  );
}

interface FAQItemProps {
  question: string;
  answer: string;
}

function FAQItem({ question, answer }: FAQItemProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Pressable 
      style={styles.faqItem}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={colors.textMuted} 
        />
      </View>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </Pressable>
  );
}

interface ContactOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action: string;
  onPress: () => void;
}

function ContactOption({ icon, title, description, action, onPress }: ContactOptionProps) {
  return (
    <Pressable style={styles.contactOption} onPress={onPress}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={24} color={colors.provenGreen} />
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactTitle}>{title}</Text>
        <Text style={styles.contactDescription}>{description}</Text>
      </View>
      <Text style={styles.contactAction}>{action}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    color: colors.provenDark,
  },
  contentContainer: {
    flex: 1,
  },
  // FAQ Styles
  faqItem: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    ...typography.bodyBold,
    color: colors.provenDark,
    flex: 1,
    marginRight: spacing.sm,
  },
  faqAnswer: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  // Contact Styles
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.provenGreen}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  contactDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  contactAction: {
    ...typography.caption,
    color: colors.provenGreen,
    fontWeight: '600',
  },
  responseTime: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: `${colors.textMuted}10`,
    borderRadius: borderRadius.md,
  },
  responseTimeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // Legal Styles
  legalScroll: {
    flex: 1,
  },
  legalHeading: {
    ...typography.bodyBold,
    color: colors.provenDark,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  legalText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  legalDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
});
