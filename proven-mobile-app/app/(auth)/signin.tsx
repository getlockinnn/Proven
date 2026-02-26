import GoogleIcon from "@/components/icons/customIcons";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

export default function SignInScreen() {
  const { signInWithGoogle, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const busy = loading || submitting;

  const handleGoogleSignIn = async () => {
    try {
      setSubmitting(true);
      await signInWithGoogle();
      // Navigation is handled by AuthProvider route protection.
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : "We couldn't sign you in right now. Please try again.";

      if (message === "Google sign-in cancelled") {
        return;
      }

      console.error("Sign in error:", error);
      Alert.alert("Sign In Issue", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "none" }} />
      <ImageBackground
        source={require("../../assets/images/onboarding.jpg")}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/images/proven-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.googleButton, busy && styles.googleButtonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.provenDark} />
              ) : (
                <GoogleIcon />
              )}
              <Text style={styles.buttonText}>
                {busy ? "Signing in..." : "Continue with Google"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 200,
    height: 200,
  },
  footer: {
    position: "absolute",
    bottom: 45,
    width: "100%",
    alignItems: "center",
  },
  googleButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    width: "85%",
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
});
