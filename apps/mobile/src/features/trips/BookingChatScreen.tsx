import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { colorTokens, layoutTokens, radiusTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { getApiErrorMessage } from '../../shared/errors';
import { formatTimeMadrid } from '../../shared/format';
import { EmptyState, ErrorState, IconButton, InlineMessage, ScreenHeader, Skeleton } from '../../shared/ui';
import { buildChatItems, CHAT_MESSAGE_MAX_LENGTH, ChatItem, mergeMessages, OutgoingMessage } from './chatMessages';
import {
  BookingMessage,
  fetchBookingMessages,
  markBookingMessagesRead,
  sendBookingMessage
} from './messagesApi';

/** Cada cuánto se piden mensajes nuevos mientras la conversación está abierta. */
const POLL_INTERVAL_MS = 4000;
/** Distancia al final por debajo de la cual se sigue el último mensaje al llegar uno nuevo. */
const STICK_TO_BOTTOM_PX = 120;

type BookingChatScreenProps = {
  bookingId: string;
  authUserId: string | null;
  title: string;
  subtitle?: string;
  topPadding?: number;
  bottomPadding?: number;
  onBack: () => void;
  /** Se llama cuando se marcan como leídos los mensajes (para refrescar contadores fuera). */
  onRead?: () => void;
};

/**
 * Alto que hay que dejar bajo el compositor. iOS: el teclado tapa la barra de pestañas,
 * así que se usa su altura. Android: si la ventana se redimensiona (adjustResize) basta con
 * el padding normal; si no (edge-to-edge sin resize), se usa la altura del teclado.
 */
function useComposerBottomInset(bottomPadding: number): number {
  const [keyboardInset, setKeyboardInset] = useState<number | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let baseWindowHeight = Dimensions.get('window').height;

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const keyboardHeight = event.endCoordinates.height;

      if (Platform.OS === 'android') {
        const shrunk = baseWindowHeight - Dimensions.get('window').height;
        setKeyboardInset(shrunk >= keyboardHeight * 0.5 ? null : keyboardHeight + spacingTokens.sm);
        return;
      }

      setKeyboardInset(keyboardHeight + spacingTokens.sm);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(null);
      baseWindowHeight = Dimensions.get('window').height;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (Platform.OS === 'web') {
    return bottomPadding + spacingTokens.md;
  }

  return keyboardInset ?? bottomPadding + spacingTokens.sm;
}

/** Conversación de una reserva: burbujas, envío con estado y polling solo mientras está abierta. */
export function BookingChatScreen({
  bookingId,
  authUserId,
  title,
  subtitle,
  topPadding = 0,
  bottomPadding = 0,
  onBack,
  onRead
}: BookingChatScreenProps) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState(false);
  const [canSend, setCanSend] = useState(true);
  const [sendBlockedReason, setSendBlockedReason] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const nearBottomRef = useRef(true);
  const messagesRef = useRef<BookingMessage[]>([]);
  messagesRef.current = messages;
  const pollingRef = useRef(false);
  const localIdRef = useRef(0);

  const composerBottom = useComposerBottomInset(bottomPadding);

  const applyPage = useCallback((page: { canSend: boolean; sendBlockedReason: string | null }) => {
    setCanSend(page.canSend);
    setSendBlockedReason(page.sendBlockedReason);
  }, []);

  const markRead = useCallback(
    async (incoming: BookingMessage[]) => {
      if (!incoming.some((message) => message.senderId !== authUserId && !message.readAt)) {
        return;
      }

      try {
        await markBookingMessagesRead(bookingId);
        onRead?.();
      } catch {
        // Se reintentará en el siguiente polling con mensajes nuevos.
      }
    },
    [authUserId, bookingId, onRead]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const page = await fetchBookingMessages(bookingId);
      setMessages(page.messages);
      setHasOlder(page.hasMore);
      applyPage(page);
      void markRead(page.messages);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'No se han podido cargar los mensajes.'));
    } finally {
      setLoading(false);
    }
  }, [applyPage, bookingId, markRead]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const poll = useCallback(async () => {
    if (pollingRef.current) {
      return;
    }

    pollingRef.current = true;

    try {
      const last = messagesRef.current[messagesRef.current.length - 1];
      const page = await fetchBookingMessages(bookingId, last ? { after: last.id } : {});
      applyPage(page);
      setPollError(false);

      if (page.messages.length > 0) {
        setMessages((current) => mergeMessages(current, page.messages));
        void markRead(page.messages);
      }
    } catch {
      setPollError(true);
    } finally {
      pollingRef.current = false;
    }
  }, [applyPage, bookingId, markRead]);

  // Polling solo con la pantalla montada, cargada y la app en primer plano.
  useEffect(() => {
    if (loading || error) {
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) {
        timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === 'active' || Platform.OS === 'web') {
      start();
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void poll();
        start();
      } else if (Platform.OS !== 'web') {
        stop();
      }
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [error, loading, poll]);

  const loadOlder = async () => {
    const first = messages[0];

    if (!first || loadingOlder) {
      return;
    }

    setLoadingOlder(true);

    try {
      const page = await fetchBookingMessages(bookingId, { before: first.id });
      nearBottomRef.current = false;
      setMessages((current) => mergeMessages(current, page.messages));
      setHasOlder(page.hasMore);
    } catch {
      setPollError(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const deliver = async (localId: string, body: string) => {
    setOutgoing((current) => current.map((item) => (item.localId === localId ? { ...item, status: 'sending' } : item)));

    try {
      const saved = await sendBookingMessage(bookingId, body);
      setOutgoing((current) => current.filter((item) => item.localId !== localId));
      setMessages((current) => mergeMessages(current, [saved]));
    } catch (sendError) {
      const status = (sendError as { response?: { status?: number } }).response?.status;
      setOutgoing((current) => current.map((item) => (item.localId === localId ? { ...item, status: 'failed' } : item)));

      if (status === 403) {
        // La conversación se ha cerrado mientras tanto: se refleja el motivo que da la API.
        setCanSend(false);
        setSendBlockedReason(getApiErrorMessage(sendError, 'Ya no se pueden enviar mensajes en esta reserva.'));
      }
    }
  };

  const handleSend = () => {
    const body = draft.trim();

    if (!body || !canSend) {
      return;
    }

    localIdRef.current += 1;
    const localId = `local-${localIdRef.current}`;
    nearBottomRef.current = true;
    setOutgoing((current) => [...current, { localId, body, createdAt: new Date().toISOString(), status: 'sending' }]);
    setDraft('');
    void deliver(localId, body);
  };

  const discardOutgoing = (localId: string) => {
    setOutgoing((current) => current.filter((item) => item.localId !== localId));
  };

  const items = useMemo(() => buildChatItems(messages, outgoing, authUserId), [messages, outgoing, authUserId]);
  const remaining = CHAT_MESSAGE_MAX_LENGTH - draft.length;

  const renderItem = (item: ChatItem) => {
    if (item.kind === 'day') {
      return (
        <View key={item.key} style={styles.dayRow}>
          <Text style={styles.dayLabel}>{item.label}</Text>
        </View>
      );
    }

    const failed = item.status === 'failed';
    const statusIcon: keyof typeof Ionicons.glyphMap =
      item.status === 'read'
        ? 'checkmark-done'
        : item.status === 'sent'
          ? 'checkmark'
          : item.status === 'sending'
            ? 'time-outline'
            : 'alert-circle';
    const statusLabel =
      item.status === 'read' ? 'Leído' : item.status === 'sent' ? 'Enviado' : item.status === 'sending' ? 'Enviando' : 'No enviado';

    return (
      <View
        key={item.key}
        style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : null, item.startsGroup ? styles.groupStart : null]}
      >
        <Pressable
          disabled={!failed}
          onPress={() => item.localId && void deliver(item.localId, item.body)}
          accessibilityRole={failed ? 'button' : undefined}
          accessibilityLabel={failed ? 'Mensaje no enviado. Toca para reintentar' : undefined}
          style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleOther, failed ? styles.bubbleFailed : null]}
        >
          <Text style={[styles.bubbleText, item.mine ? styles.bubbleTextMine : null]} selectable={!failed}>
            {item.body}
          </Text>
          <View style={styles.bubbleMeta}>
            <Text style={[styles.bubbleTime, item.mine ? styles.bubbleTimeMine : null]}>{formatTimeMadrid(item.createdAt)}</Text>
            {item.mine ? (
              <Ionicons
                name={statusIcon}
                size={14}
                color={failed ? colorTokens.alert : item.status === 'read' ? colorTokens.accent1 : 'rgba(255,255,255,0.75)'}
                accessibilityLabel={statusLabel}
              />
            ) : null}
          </View>
        </Pressable>
        {failed && item.localId ? (
          <View style={styles.failedActions}>
            <Text style={styles.failedText}>No enviado.</Text>
            <Pressable onPress={() => void deliver(item.localId as string, item.body)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.failedLink}>Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => discardOutgoing(item.localId as string)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.failedLink}>Descartar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const renderBody = () => {
    if (loading && messages.length === 0) {
      return (
        <View style={styles.skeletons}>
          <Skeleton width="60%" height={44} radius={radiusTokens.lg} />
          <Skeleton width="45%" height={44} radius={radiusTokens.lg} style={styles.skeletonMine} />
          <Skeleton width="70%" height={64} radius={radiusTokens.lg} />
        </View>
      );
    }

    if (error) {
      return <ErrorState message={error} onRetry={() => void loadInitial()} />;
    }

    if (items.length === 0) {
      return (
        <EmptyState
          compact
          icon="chatbubbles-outline"
          title="Aún no hay mensajes"
          description={
            canSend
              ? 'Coordina la entrega y la devolución sin compartir tu teléfono. Solo vosotros dos veis esta conversación.'
              : 'Esta conversación no tiene mensajes.'
          }
        />
      );
    }

    return (
      <>
        {hasOlder ? (
          <Pressable
            onPress={() => void loadOlder()}
            style={styles.olderButton}
            accessibilityRole="button"
            disabled={loadingOlder}
          >
            {loadingOlder ? (
              <ActivityIndicator size="small" color={colorTokens.primary} />
            ) : (
              <Text style={styles.olderLabel}>Ver mensajes anteriores</Text>
            )}
          </Pressable>
        ) : null}
        {items.map(renderItem)}
      </>
    );
  };

  return (
    <View style={[styles.flex, { paddingTop: topPadding }]}>
      <View style={styles.headerWrap}>
        <View style={styles.inner}>
          <ScreenHeader title="Mensajes" eyebrow={title} subtitle={subtitle} onBack={onBack} backLabel="Reserva" />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        scrollEventThrottle={64}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < STICK_TO_BOTTOM_PX;
        }}
        onContentSizeChange={() => {
          if (nearBottomRef.current) {
            scrollRef.current?.scrollToEnd({ animated: messages.length > 0 });
          }
        }}
      >
        <View style={[styles.inner, styles.thread]}>{renderBody()}</View>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: composerBottom }]}>
        <View style={styles.inner}>
          {pollError && !error ? (
            <Text style={styles.connection} accessibilityLiveRegion="polite">
              Sin conexión. Reintentando...
            </Text>
          ) : null}
          {!canSend && !loading ? (
            <InlineMessage tone="info" message={sendBlockedReason ?? 'Ya no se pueden enviar mensajes en esta reserva.'} />
          ) : (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Escribe un mensaje"
                placeholderTextColor={colorTokens.textSubtle}
                multiline
                // En web el textarea arranca con dos filas: se deja en una como en nativo.
                numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                editable={!loading && !error}
                accessibilityLabel="Mensaje"
                onKeyPress={(event) => {
                  // En web, Intro envía y Mayús+Intro hace salto de línea.
                  const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                  if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                    (event as unknown as { preventDefault: () => void }).preventDefault();
                    handleSend();
                  }
                }}
              />
              <IconButton
                icon="send"
                variant="primary"
                accessibilityLabel="Enviar mensaje"
                onPress={handleSend}
                disabled={!draft.trim() || loading || !!error}
              />
            </View>
          )}
          {canSend && remaining <= 200 ? (
            <Text style={[styles.counter, remaining <= 0 ? styles.counterLimit : null]}>
              {remaining} caracteres restantes
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  inner: {
    width: '100%',
    maxWidth: layoutTokens.formMaxWidth,
    alignSelf: 'center'
  },
  headerWrap: {
    paddingHorizontal: spacingTokens.lg,
    paddingTop: spacingTokens.md,
    paddingBottom: spacingTokens.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacingTokens.lg,
    paddingVertical: spacingTokens.md
  },
  thread: {
    flexGrow: 1,
    justifyContent: 'flex-end'
  },
  skeletons: {
    gap: spacingTokens.md
  },
  skeletonMine: {
    alignSelf: 'flex-end'
  },
  dayRow: {
    alignItems: 'center',
    marginTop: spacingTokens.lg,
    marginBottom: spacingTokens.xs
  },
  dayLabel: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted,
    backgroundColor: colorTokens.surfaceMuted,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: 2,
    borderRadius: radiusTokens.pill,
    overflow: 'hidden'
  },
  bubbleRow: {
    alignItems: 'flex-start',
    marginTop: 2
  },
  bubbleRowMine: {
    alignItems: 'flex-end'
  },
  groupStart: {
    marginTop: spacingTokens.sm
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.lg,
    gap: 2
  },
  bubbleOther: {
    backgroundColor: colorTokens.white,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderBottomLeftRadius: radiusTokens.sm / 2
  },
  bubbleMine: {
    backgroundColor: colorTokens.primary,
    borderBottomRightRadius: radiusTokens.sm / 2
  },
  bubbleFailed: {
    opacity: 0.7
  },
  bubbleText: {
    ...typographyTokens.body,
    color: colorTokens.textMain
  },
  bubbleTextMine: {
    color: colorTokens.white
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacingTokens.xs
  },
  bubbleTime: {
    ...typographyTokens.caption,
    fontSize: 11,
    lineHeight: 14,
    color: colorTokens.textSubtle
  },
  bubbleTimeMine: {
    color: 'rgba(255,255,255,0.75)'
  },
  failedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.md,
    marginTop: spacingTokens.xs
  },
  failedText: {
    ...typographyTokens.caption,
    color: colorTokens.alertText
  },
  failedLink: {
    ...typographyTokens.captionStrong,
    color: colorTokens.accent2
  },
  olderButton: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacingTokens.lg,
    borderRadius: radiusTokens.pill,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white,
    marginBottom: spacingTokens.sm,
    ...layoutTokens.webCursor
  },
  olderLabel: {
    ...typographyTokens.captionStrong,
    color: colorTokens.primary
  },
  composerWrap: {
    paddingHorizontal: spacingTokens.lg,
    paddingTop: spacingTokens.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacingTokens.sm
  },
  input: {
    ...typographyTokens.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingHorizontal: spacingTokens.md,
    paddingTop: Platform.OS === 'ios' ? 12 : spacingTokens.sm,
    paddingBottom: Platform.OS === 'ios' ? 12 : spacingTokens.sm,
    borderRadius: radiusTokens.input,
    borderWidth: 1,
    borderColor: colorTokens.borderStrong,
    backgroundColor: colorTokens.white,
    color: colorTokens.textMain,
    textAlignVertical: 'center'
  },
  counter: {
    ...typographyTokens.caption,
    color: colorTokens.textMuted,
    marginTop: spacingTokens.xs,
    textAlign: 'right'
  },
  counterLimit: {
    color: colorTokens.alertText
  },
  connection: {
    ...typographyTokens.caption,
    color: colorTokens.warningText,
    marginBottom: spacingTokens.xs,
    textAlign: 'center'
  }
});
