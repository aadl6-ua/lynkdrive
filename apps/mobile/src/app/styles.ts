import { StyleSheet } from 'react-native';
import { colorTokens, radiusTokens, shadowTokens, spacingTokens, typographyTokens } from './theme/tokens';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colorTokens.bgLight
  },
  content: {
    padding: spacingTokens.lg,
    gap: spacingTokens.lg
  },
  contentWithBottomBar: {
    paddingBottom: 96
  },
  sectionCard: {
    gap: spacingTokens.md
  },
  userSwitcherCard: {
    gap: spacingTokens.sm,
    marginBottom: spacingTokens.md,
    padding: spacingTokens.md,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.white
  },
  switcherTitle: {
    color: colorTokens.primary,
    ...typographyTokens.sectionLabel
  },
  title: {
    color: colorTokens.primary,
    ...typographyTokens.title
  },
  subtitle: {
    color: colorTokens.textMuted,
    ...typographyTokens.subtitle
  },
  input: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.input,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.md,
    color: colorTokens.textMain,
    backgroundColor: colorTokens.white,
    ...typographyTokens.body
  },
  buttonContainer: {
    alignSelf: 'flex-start'
  },
  card: {
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.lg,
    gap: spacingTokens.sm,
    backgroundColor: colorTokens.white,
    ...shadowTokens.card
  },
  row: {
    color: colorTokens.textMain,
    ...typographyTokens.body
  },
  label: {
    fontWeight: '700',
    color: colorTokens.secondary
  },
  error: {
    color: colorTokens.alert,
    ...typographyTokens.caption
  },
  info: {
    color: colorTokens.success,
    ...typographyTokens.caption
  },
  profileHeaderCard: {
    flexDirection: 'row',
    gap: spacingTokens.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.card,
    padding: spacingTokens.lg,
    backgroundColor: colorTokens.white,
    ...shadowTokens.card
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCircleImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colorTokens.bgLight
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: colorTokens.primary
  },
  profileHeaderInfo: {
    flex: 1,
    gap: 2
  },
  profileName: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: colorTokens.primary
  },
  profileMeta: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  formGrid: {
    gap: spacingTokens.sm
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacingTokens.sm,
    flexWrap: 'wrap'
  },
  actionButtonWrapper: {
    minWidth: 88
  },
  linkHint: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  profileImagePreview: {
    width: 96,
    height: 96,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  vehicleImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacingTokens.sm,
    paddingHorizontal: spacingTokens.md,
    paddingTop: spacingTokens.md,
    paddingBottom: spacingTokens.sm,
    borderBottomWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.white
  },
  hiddenNav: {
    display: 'none'
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacingTokens.md,
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: spacingTokens.sm,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: radiusTokens.nav,
    backgroundColor: colorTokens.white,
    ...shadowTokens.card
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingTokens.sm,
    paddingVertical: spacingTokens.sm,
    borderRadius: radiusTokens.input
  },
  navButtonActive: {
    backgroundColor: colorTokens.primary
  },
  navLabel: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  },
  navLabelActive: {
    color: colorTokens.white,
    ...typographyTokens.caption
  },
  vehicleCardMedia: {
    width: '100%',
    height: 170,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight
  },
  vehicleCardMediaPlaceholder: {
    width: '100%',
    height: 170,
    borderRadius: radiusTokens.input,
    backgroundColor: colorTokens.bgLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  vehicleCardMediaPlaceholderText: {
    color: colorTokens.textMuted,
    ...typographyTokens.caption
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colorTokens.primary
  },
  chipBase: {
    alignSelf: 'flex-start',
    borderRadius: radiusTokens.pill,
    paddingHorizontal: spacingTokens.md,
    paddingVertical: spacingTokens.xs,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.bgLight
  },
  chipText: {
    color: colorTokens.secondary,
    ...typographyTokens.caption
  }
});
