import { StyleSheet, Text, View } from 'react-native';
import { colorTokens, spacingTokens, typographyTokens } from '../../app/theme/tokens';
import { LEGAL_CONTENT, LegalDoc } from '../legal';
import { Sheet } from '../ui';

type LegalSheetProps = {
  doc: LegalDoc | null;
  onClose: () => void;
};

/** Muestra un documento legal en un diálogo desplazable (registro y Perfil). */
export function LegalSheet({ doc, onClose }: LegalSheetProps) {
  const content = doc ? LEGAL_CONTENT[doc] : null;

  return (
    <Sheet visible={!!content} onClose={onClose} title={content?.title} subtitle={content ? `Actualizado el ${content.updatedAt}` : undefined} centered>
      {content ? <LegalDocumentBody doc={doc as LegalDoc} /> : null}
    </Sheet>
  );
}

export function LegalDocumentBody({ doc }: { doc: LegalDoc }) {
  return (
    <View style={styles.body}>
      {LEGAL_CONTENT[doc].sections.map((section, sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          {section.heading ? (
            <Text style={styles.heading} accessibilityRole="header">
              {section.heading}
            </Text>
          ) : null}
          {section.paragraphs.map((paragraph, index) => (
            <Text key={index} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacingTokens.md
  },
  section: {
    gap: spacingTokens.xs
  },
  heading: {
    color: colorTokens.primary,
    ...typographyTokens.bodyStrong
  },
  paragraph: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  }
});
