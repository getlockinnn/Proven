import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

export default function Index() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const navigatedRef = { current: false };

    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }).start(() => {
          if (!navigatedRef.current) {
            navigatedRef.current = true;
            router.replace("/(main)");
          }
        });
      }, 1500);

    const fallbackNav = setTimeout(() => {
      if (!navigatedRef.current) {
        navigatedRef.current = true;
        router.replace("/(main)");
      }
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(fallbackNav);
    };
  }, [fadeAnim, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/proven-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  backgroundImage: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  logoContainer: {
    flex: 1,
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 200,
    height: 200,
  },
});
