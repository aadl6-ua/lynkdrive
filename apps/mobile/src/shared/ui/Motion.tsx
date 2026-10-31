import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { motionTokens } from "../../app/theme/tokens";

// El driver nativo no existe en web; allí Animated anima en JS.
export const USE_NATIVE_DRIVER = Platform.OS !== "web";
export const EASE_OUT = Easing.out(Easing.cubic);

/** Respeta la preferencia del sistema "Reducir movimiento" (iOS, Android y web). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

type CollapsibleProps = {
  open: boolean;
  children: ReactNode;
  /** Separación bajo el contenido cuando está abierto (sustituye al `gap` del padre). */
  spacingBelow?: number;
};

/**
 * Muestra u oculta su contenido animando altura y opacidad, sin desmontarlo.
 * Mientras está abierto y quieto no recorta (los desplegables pueden sobresalir).
 */
export function Collapsible({
  open,
  children,
  spacingBelow = 0,
}: CollapsibleProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [contentHeight, setContentHeight] = useState(0);
  const [settledOpen, setSettledOpen] = useState(open);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSettledOpen(false);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : motionTokens.durationShortMs,
      easing: EASE_OUT,
      // La altura no se puede animar con el driver nativo.
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && open) setSettledOpen(true);
    });
    return () => animation.stop();
  }, [open, progress, reducedMotion]);

  const fullHeight = contentHeight + spacingBelow;
  const animatedHeight =
    contentHeight > 0
      ? progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, fullHeight],
        })
      : undefined;

  return (
    <Animated.View
      pointerEvents={open ? "auto" : "none"}
      aria-hidden={!open}
      style={[
        settledOpen ? styles.visible : styles.clipped,
        { opacity: progress },
        settledOpen
          ? { paddingBottom: spacingBelow }
          : { height: animatedHeight ?? (open ? undefined : 0) },
      ]}
    >
      <View
        onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );
}

type ScreenTransitionProps = {
  /** Cambia en cada pantalla nueva: dispara la animación de entrada. */
  transitionKey: string;
  /** 1 si la pantalla nueva está a la derecha de la anterior, -1 si a la izquierda. */
  direction: 1 | -1;
  children: ReactNode;
};

/** Entrada suave al cambiar de pestaña: fundido y un pequeño desplazamiento lateral. */
export function ScreenTransition({
  transitionKey,
  direction,
  children,
}: ScreenTransitionProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  // useLayoutEffect: se pone a 0 antes de pintar y no se ve un fotograma de golpe.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motionTokens.durationMediumMs,
      easing: EASE_OUT,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [transitionKey, progress, reducedMotion]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [direction * 24, 0],
  });

  return (
    <Animated.View
      style={[styles.flex, { opacity: progress, transform: [{ translateX }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  clipped: { overflow: "hidden" },
  visible: { overflow: "visible" },
});
