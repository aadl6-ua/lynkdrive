import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colorTokens, layoutTokens, shadowTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { LegalDocumentBody } from '../../shared/components/LegalSheet';
import { LEGAL_CONTENT, LegalDoc } from '../../shared/legal';

const DOC_BY_SLUG: Record<string, LegalDoc> = {
  terminos: 'terms',
  privacidad: 'privacy',
  cancelacion: 'cancellation'
};

/**
 * En web, `?legal=privacidad|terminos|cancelacion` muestra el documento sin iniciar sesión.
 * Es la URL pública que piden App Store y Google Play para la política de privacidad.
 */
export function getWebLegalDoc(): LegalDoc | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const slug = new URLSearchParams(window.location.search).get('legal');
  return slug ? (DOC_BY_SLUG[slug] ?? null) : null;
}

function goTo(url: string) {
  window.location.assign(url);
}

type LegalPageProps = { doc: LegalDoc; topInset?: number };

export function LegalPage({ doc, topInset = 0 }: LegalPageProps) {
  const content = LEGAL_CONTENT[doc];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.scroll, { paddingTop: topInset + spacingTokens.xl }]}>
      <View style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Text style={styles.markLetter}>L</Text>
          </View>
          <Text style={styles.brand}>LynkDrive</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {content.title}
        </Text>
        <Text style={styles.updated}>Actualizado el {content.updatedAt}</Text>
        <View style={styles.card}>
          <LegalDocumentBody doc={doc} />
        </View>
        <View style={styles.links}>
          {Object.entries(DOC_BY_SLUG)
            .filter(([, value]) => value !== doc)
            .map(([slug, value]) => (
              <Text key={slug} style={styles.link} accessibilityRole="link" onPress={() => goTo(`?legal=${slug}`)}>
                {LEGAL_CONTENT[value].title}
              </Text>
            ))}
          <Text style={styles.link} accessibilityRole="link" onPress={() => goTo(window.location.pathname)}>
            Ir a LynkDrive
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  scroll: {
    paddingHorizontal: spacingTokens.md,
    paddingBottom: spacingTokens.xxl
  },
  page: {
    width: '100%',
    maxWidth: layoutTokens.formMaxWidth,
    alignSelf: 'center',
    gap: spacingTokens.sm
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingTokens.sm,
    marginBottom: spacingTokens.md
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colorTokens.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markLetter: {
    color: colorTokens.accent1,
    ...typographyTokens.h3,
    lineHeight: undefined
  },
  brand: {
    color: colorTokens.primary,
    ...typographyTokens.h3
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.title
  },
  updated: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  card: {
    marginTop: spacingTokens.md,
    padding: spacingTokens.lg,
    backgroundColor: colorTokens.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colorTokens.border,
    ...shadowTokens.card
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingTokens.md,
    marginTop: spacingTokens.lg
  },
  link: {
    color: colorTokens.accent2,
    ...typographyTokens.captionStrong
  }
});
