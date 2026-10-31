import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colorTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { canUseCamera, ImageSource } from '../imagePicker';
import { IconButton } from './Button';
import { AppImage, ImageViewer } from './Media';
import { OptionList, Sheet } from './Sheet';

export type PhotoItemStatus = 'processing' | 'uploading' | 'error' | 'done';

export type PhotoItem = {
  key: string;
  uri: string | null;
  status: PhotoItemStatus;
  /** 0..1 durante la subida. */
  progress?: number;
  isCover?: boolean;
  errorMessage?: string;
  /** Evidencia privada sin URL de previsualización. */
  privateLabel?: string;
};

type PhotoGridProps = {
  items: PhotoItem[];
  onAdd?: (source: ImageSource) => void;
  onRemove?: (item: PhotoItem) => void;
  onRetry?: (item: PhotoItem) => void;
  onSetCover?: (item: PhotoItem) => void;
  addLabel?: string;
  disabled?: boolean;
  maxItems?: number;
  columns?: number;
};

/**
 * Rejilla de miniaturas con estado por foto: optimizando, subiendo (con %),
 * error con reintento, portada y borrado. Abre visor a pantalla completa.
 */
export function PhotoGrid({
  items,
  onAdd,
  onRemove,
  onRetry,
  onSetCover,
  addLabel = 'Añadir fotos',
  disabled = false,
  maxItems,
  columns = 3
}: PhotoGridProps) {
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const gap = spacingTokens.sm;
  const tileSize = gridWidth > 0 ? Math.floor((gridWidth - gap * (columns - 1)) / columns) : 0;
  const viewable = items.filter((item) => item.uri && item.status === 'done').map((item) => item.uri as string);
  const canAdd = !!onAdd && (maxItems === undefined || items.length < maxItems);

  const handleAddPress = () => {
    if (!onAdd) {
      return;
    }

    if (canUseCamera()) {
      setSourceSheetOpen(true);
    } else {
      onAdd('library');
    }
  };

  return (
    <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
      {tileSize > 0 ? (
        <View style={[styles.grid, { gap }]}>
          {items.map((item) => {
            const busy = item.status === 'uploading' || item.status === 'processing';
            const viewIndex = item.uri ? viewable.indexOf(item.uri) : -1;

            return (
              <View key={item.key} style={[styles.tile, { width: tileSize, height: tileSize }]}>
                <Pressable
                  disabled={busy || viewIndex < 0}
                  onPress={() => setViewerIndex(viewIndex)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={item.isCover ? 'Foto de portada. Toca para ampliar' : 'Foto. Toca para ampliar'}
                  style={StyleSheet.absoluteFill}
                >
                  <AppImage
                    uri={item.uri}
                    style={StyleSheet.absoluteFill}
                    fallbackIcon="lock-closed-outline"
                    fallbackLabel={item.privateLabel}
                  />
                </Pressable>

                {busy ? (
                  <View style={styles.overlay} pointerEvents="none">
                    <ActivityIndicator color={colorTokens.white} />
                    <Text style={styles.overlayText}>
                      {item.status === 'processing'
                        ? 'Optimizando'
                        : typeof item.progress === 'number'
                          ? `${Math.round(item.progress * 100)}%`
                          : 'Subiendo'}
                    </Text>
                    {item.status === 'uploading' && typeof item.progress === 'number' ? (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(item.progress * 100)}%` }]} />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {item.status === 'error' ? (
                  <View style={[styles.overlay, styles.overlayError]}>
                    <Ionicons name="alert-circle" size={22} color={colorTokens.white} />
                    <Text style={styles.overlayText} numberOfLines={2}>
                      {item.errorMessage ?? 'Error al subir'}
                    </Text>
                    {onRetry ? (
                      <Pressable
                        onPress={() => onRetry(item)}
                        accessibilityRole="button"
                        accessibilityLabel="Reintentar subida"
                        style={styles.retry}
                        hitSlop={8}
                      >
                        <Ionicons name="refresh" size={14} color={colorTokens.primary} />
                        <Text style={styles.retryText}>Reintentar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {item.isCover ? (
                  <View style={styles.coverBadge}>
                    <Ionicons name="star" size={11} color={colorTokens.primary} />
                    <Text style={styles.coverBadgeText}>Portada</Text>
                  </View>
                ) : null}

                {!busy ? (
                  <View style={styles.tileActions}>
                    {onSetCover && item.status === 'done' && !item.isCover ? (
                      <IconButton
                        icon="star-outline"
                        variant="overlay"
                        size={30}
                        accessibilityLabel="Usar como portada"
                        onPress={() => onSetCover(item)}
                        disabled={disabled}
                      />
                    ) : null}
                    {onRemove ? (
                      <IconButton
                        icon="trash-outline"
                        variant="overlay"
                        size={30}
                        color={colorTokens.alertText}
                        accessibilityLabel="Eliminar foto"
                        onPress={() => onRemove(item)}
                        disabled={disabled}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {canAdd ? (
            <Pressable
              onPress={handleAddPress}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={addLabel}
              style={({ pressed }) => [
                styles.tile,
                styles.addTile,
                { width: tileSize, height: tileSize },
                pressed ? styles.addTilePressed : null,
                disabled ? styles.addTileDisabled : null
              ]}
            >
              <Ionicons name="add-circle-outline" size={28} color={colorTokens.secondary} />
              <Text style={styles.addText}>{addLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Sheet visible={sourceSheetOpen} onClose={() => setSourceSheetOpen(false)} title="Añadir foto">
        <OptionList
          options={[
            { value: 'camera', label: 'Hacer foto', icon: 'camera-outline' },
            { value: 'library', label: 'Elegir de la galería', icon: 'images-outline' }
          ]}
          onSelect={(value) => {
            setSourceSheetOpen(false);
            // Esperamos al cierre de la hoja para no solapar modales en iOS.
            setTimeout(() => onAdd?.(value as ImageSource), 350);
          }}
        />
      </Sheet>

      <ImageViewer images={viewable} index={viewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  tile: {
    borderRadius: radiusTokens.input,
    overflow: 'hidden',
    backgroundColor: colorTokens.surfaceMuted
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,27,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacingTokens.sm
  },
  overlayError: {
    backgroundColor: 'rgba(176,58,46,0.82)'
  },
  overlayText: {
    color: colorTokens.white,
    textAlign: 'center',
    ...typographyTokens.captionStrong,
    fontSize: 12
  },
  progressTrack: {
    width: '70%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden'
  },
  progressFill: {
    height: 4,
    backgroundColor: colorTokens.accent1
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colorTokens.white,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: 4
  },
  retryText: {
    color: colorTokens.primary,
    ...typographyTokens.captionStrong,
    fontSize: 12
  },
  coverBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colorTokens.accent1,
    borderRadius: radiusTokens.pill,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  coverBadgeText: {
    color: colorTokens.primary,
    ...typographyTokens.overline,
    letterSpacing: 0.2
  },
  tileActions: {
    position: 'absolute',
    top: 6,
    right: 6,
    gap: 6
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colorTokens.borderStrong,
    backgroundColor: colorTokens.white,
    padding: spacingTokens.sm
  },
  addTilePressed: {
    backgroundColor: colorTokens.bgLight
  },
  addTileDisabled: {
    opacity: 0.5
  },
  addText: {
    color: colorTokens.secondary,
    textAlign: 'center',
    ...typographyTokens.captionStrong,
    fontSize: 12
  }
});
