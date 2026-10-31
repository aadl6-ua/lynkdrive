import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, ImageContentFit } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { getInitialsFromName } from '../format';
import { IconButton } from './Button';

type AppImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Texto del placeholder cuando no hay imagen o falla la carga. */
  fallbackLabel?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  recyclingKey?: string;
};

/**
 * Imagen con caché en memoria y disco (expo-image), transición suave y
 * placeholder consistente si no hay URL o la descarga falla.
 */
export function AppImage({
  uri,
  style,
  contentFit = 'cover',
  fallbackLabel,
  fallbackIcon = 'car-sport-outline',
  accessibilityLabel,
  recyclingKey
}: AppImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, style]} accessibilityLabel={accessibilityLabel ?? fallbackLabel} accessible>
        <Ionicons name={failed ? 'image-outline' : fallbackIcon} size={28} color={colorTokens.textSubtle} />
        {fallbackLabel ? <Text style={styles.fallbackText} numberOfLines={2}>{failed ? 'No se pudo cargar la imagen' : fallbackLabel}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.imageWrap, style]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={200}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey ?? uri}
        onError={() => setFailed(true)}
        accessibilityLabel={accessibilityLabel}
        accessible={!!accessibilityLabel}
      />
    </View>
  );
}

type AvatarProps = {
  uri: string | null | undefined;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  tone?: 'light' | 'dark';
};

export function Avatar({ uri, name, size = 40, style, tone = 'light' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (!uri || failed) {
    return (
      <View
        style={[styles.avatarFallback, dimension, tone === 'dark' ? styles.avatarFallbackDark : null, style]}
        accessibilityLabel={`Avatar de ${name}`}
        accessible
      >
        <Text
          style={[
            styles.avatarInitials,
            { fontSize: Math.max(12, Math.round(size * 0.36)) },
            tone === 'dark' ? styles.avatarInitialsDark : null
          ]}
        >
          {getInitialsFromName(name)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.avatar, dimension, style as object]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
      accessibilityLabel={`Avatar de ${name}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Carrusel + visor a pantalla completa                                       */
/* -------------------------------------------------------------------------- */

type ImageCarouselProps = {
  images: string[];
  height?: number;
  emptyLabel?: string;
  loading?: boolean;
};

/** Carrusel paginado con indicador y apertura de visor a pantalla completa. */
export function ImageCarousel({ images, height = 240, emptyLabel = 'Sin fotos todavía', loading = false }: ImageCarouselProps) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [images.length]);

  if (loading) {
    return (
      <View style={[styles.carouselEmpty, { height }]}>
        <ActivityIndicator color={colorTokens.primary} />
      </View>
    );
  }

  if (images.length === 0) {
    return <AppImage uri={null} style={[styles.carouselEmpty, { height }]} fallbackLabel={emptyLabel} />;
  }

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) {
      return;
    }

    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(images.length - 1, Math.max(0, next)));
  };

  const goTo = (next: number) => {
    const clamped = Math.min(images.length - 1, Math.max(0, next));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  };

  return (
    <View style={[styles.carousel, { height }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          onScroll={Platform.OS === 'web' ? handleScrollEnd : undefined}
          scrollEventThrottle={64}
        >
          {images.map((uri, imageIndex) => (
            <Pressable
              key={`${uri}-${imageIndex}`}
              onPress={() => setViewerIndex(imageIndex)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Foto ${imageIndex + 1} de ${images.length}. Toca para ampliar`}
            >
              <AppImage uri={uri} style={{ width, height }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {images.length > 1 ? (
        <>
          <View style={styles.counter}>
            <Ionicons name="images-outline" size={12} color={colorTokens.white} />
            <Text style={styles.counterText}>
              {index + 1}/{images.length}
            </Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, dotIndex) => (
              <View key={dotIndex} style={[styles.dot, dotIndex === index ? styles.dotActive : null]} />
            ))}
          </View>
          {Platform.OS === 'web' ? (
            <>
              {index > 0 ? (
                <IconButton
                  icon="chevron-back"
                  variant="overlay"
                  size={36}
                  accessibilityLabel="Foto anterior"
                  onPress={() => goTo(index - 1)}
                  style={[styles.navButton, { left: spacingTokens.sm }]}
                />
              ) : null}
              {index < images.length - 1 ? (
                <IconButton
                  icon="chevron-forward"
                  variant="overlay"
                  size={36}
                  accessibilityLabel="Foto siguiente"
                  onPress={() => goTo(index + 1)}
                  style={[styles.navButton, { right: spacingTokens.sm }]}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <ImageViewer images={images} index={viewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

type ImageViewerProps = {
  images: string[];
  index: number | null;
  onClose: () => void;
};

export function ImageViewer({ images, index, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (index === null) {
      return;
    }

    setCurrent(index);
    const timeout = setTimeout(() => scrollRef.current?.scrollTo({ x: index * width, animated: false }), 0);
    return () => clearTimeout(timeout);
  }, [index, width]);

  const goTo = (next: number) => {
    const clamped = Math.min(images.length - 1, Math.max(0, next));
    setCurrent(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  };

  return (
    <Modal visible={index !== null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {images.map((uri, imageIndex) => (
            <View key={`${uri}-${imageIndex}`} style={{ width, height, justifyContent: 'center' }}>
              <AppImage uri={uri} contentFit="contain" style={{ width, height: height * 0.8, backgroundColor: 'transparent' }} />
            </View>
          ))}
        </ScrollView>

        <View style={[styles.viewerTop, { top: insets.top + spacingTokens.sm }]}>
          <Text style={styles.viewerCounter}>
            {Math.min(current + 1, images.length)} / {images.length}
          </Text>
          <IconButton icon="close" variant="overlay" accessibilityLabel="Cerrar galería" onPress={onClose} />
        </View>

        {images.length > 1 ? (
          <View style={[styles.viewerNav, { bottom: insets.bottom + spacingTokens.xl }]}>
            <IconButton
              icon="chevron-back"
              variant="overlay"
              accessibilityLabel="Foto anterior"
              onPress={() => goTo(current - 1)}
              disabled={current <= 0}
            />
            <IconButton
              icon="chevron-forward"
              variant="overlay"
              accessibilityLabel="Foto siguiente"
              onPress={() => goTo(current + 1)}
              disabled={current >= images.length - 1}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
    backgroundColor: colorTokens.surfaceMuted
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingTokens.xs,
    backgroundColor: colorTokens.surfaceMuted,
    padding: spacingTokens.md,
    overflow: 'hidden'
  },
  fallbackText: {
    color: colorTokens.textMuted,
    textAlign: 'center',
    ...typographyTokens.caption
  },
  avatar: {
    backgroundColor: colorTokens.surfaceMuted
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.infoSoft
  },
  avatarFallbackDark: {
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  avatarInitials: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong,
    lineHeight: undefined
  },
  avatarInitialsDark: {
    color: colorTokens.accent1
  },
  carousel: {
    width: '100%',
    borderRadius: radiusTokens.card,
    overflow: 'hidden',
    backgroundColor: colorTokens.surfaceMuted
  },
  carouselEmpty: {
    width: '100%',
    borderRadius: radiusTokens.card,
    backgroundColor: colorTokens.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  counter: {
    position: 'absolute',
    top: spacingTokens.sm,
    right: spacingTokens.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: 3,
    borderRadius: radiusTokens.pill,
    backgroundColor: 'rgba(13,27,42,0.7)'
  },
  counterText: {
    color: colorTokens.white,
    ...typographyTokens.captionStrong,
    fontSize: 12
  },
  dots: {
    position: 'absolute',
    bottom: spacingTokens.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)'
  },
  dotActive: {
    width: 16,
    backgroundColor: colorTokens.white
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -18
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.96)'
  },
  viewerTop: {
    position: 'absolute',
    left: spacingTokens.lg,
    right: spacingTokens.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  viewerCounter: {
    color: colorTokens.white,
    ...typographyTokens.captionStrong,
    fontSize: 14
  },
  viewerNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacingTokens.xl
  }
});
