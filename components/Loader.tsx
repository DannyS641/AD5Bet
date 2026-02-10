import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Brand } from "@/constants/brand";

interface LoaderProps {
  duration?: number;
  onComplete?: () => void;
  logoSource?: ImageSourcePropType;
}

export default function Loader({
  duration = 3500,
  onComplete,
  logoSource,
}: LoaderProps) {
  const [visible, setVisible] = useState(true);
  const { width, height } = useWindowDimensions();
  const minDim = Math.min(width, height);
  const logoSize = Math.max(48, Math.floor(minDim * 0.11));
  const orbitRadius = Math.max(36, Math.floor(logoSize * 0.6));
  const orbitSize = Math.max(14, Math.floor(logoSize * 0.12));
  const orbitDiameter = orbitRadius * 2;

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const orbRotate = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const orbLoop = Animated.loop(
      Animated.timing(orbRotate, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    orbLoop.start();
    pulseLoop.start();

    return () => {
      orbLoop.stop();
      pulseLoop.stop();
    };
  }, [logoPulse, orbRotate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onComplete?.();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete, overlayOpacity]);

  if (!visible) return null;

  const rotate = orbRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const pulse = logoPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <View style={styles.content}>
        <View style={[styles.logoWrap, { width: orbitDiameter, height: orbitDiameter }]}>
          <Animated.View
            style={[
              styles.orbitSpinner,
              { width: orbitDiameter, height: orbitDiameter, transform: [{ rotate }] },
            ]}
          >
            {[
              { angle: 0, color: Brand.gold },
              { angle: 120, color: Brand.red },
              { angle: 240, color: Brand.navySoft },
            ].map((orb) => (
              <View
                key={`orb-${orb.angle}`}
                style={[
                  styles.orbitDot,
                  {
                    width: orbitSize,
                    height: orbitSize,
                    borderRadius: orbitSize / 2,
                    top: orbitDiameter / 2 - orbitSize / 2,
                    left: orbitDiameter / 2 - orbitSize / 2,
                    backgroundColor: orb.color,
                    transform: [
                      { rotate: `${orb.angle}deg` },
                      { translateX: orbitRadius },
                    ],
                  },
                ]}
              />
            ))}
          </Animated.View>

          <Animated.View style={[styles.logoHolder, { transform: [{ scale: pulse }] }]}>
            <Image
              source={logoSource ?? require("../assets/images/balls-sports.png")}
              style={[styles.logo, { width: logoSize, height: logoSize }]}
              resizeMode="contain"
              accessibilityLabel="AD5Bet logo"
            />
          </Animated.View>
        </View>

      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 20,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  orbitSpinner: {
    position: "absolute",
  },
  orbitDot: {
    position: "absolute",
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  logoHolder: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    backgroundColor: "transparent",
  },
});
