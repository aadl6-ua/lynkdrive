import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f5f9'
  },
  content: {
    padding: 16
  },
  contentWithBottomBar: {
    paddingBottom: 96
  },
  sectionCard: {
    gap: 12
  },
  userSwitcherCard: {
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10
  },
  switcherTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  title: {
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 14,
    color: '#555'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  buttonContainer: {
    alignSelf: 'flex-start'
  },
  card: {
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 14,
    padding: 14,
    gap: 8
  },
  row: {
    fontSize: 14
  },
  label: {
    fontWeight: '600'
  },
  error: {
    color: '#b00020',
    fontSize: 13
  },
  info: {
    color: '#0a6c00',
    fontSize: 13
  },
  profileHeaderCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#ffffff'
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCircleImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0'
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700'
  },
  profileHeaderInfo: {
    flex: 1,
    gap: 2
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700'
  },
  profileMeta: {
    fontSize: 12,
    color: '#666'
  },
  formGrid: {
    gap: 8
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionButtonWrapper: {
    minWidth: 88
  },
  linkHint: {
    fontSize: 12,
    color: '#666'
  },
  profileImagePreview: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#eee'
  },
  vehicleImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#eee'
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#e3e7f0',
    backgroundColor: '#ffffff'
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
    marginHorizontal: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#dde3ee',
    borderRadius: 14,
    backgroundColor: '#ffffff'
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10
  },
  navButtonActive: {
    backgroundColor: '#1e2c4f'
  },
  navLabel: {
    fontSize: 13,
    color: '#33415f',
    fontWeight: '600'
  },
  navLabelActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  vehicleCardMedia: {
    width: '100%',
    height: 170,
    borderRadius: 10,
    backgroundColor: '#e8ecf4'
  },
  vehicleCardMediaPlaceholder: {
    width: '100%',
    height: 170,
    borderRadius: 10,
    backgroundColor: '#e8ecf4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  vehicleCardMediaPlaceholderText: {
    color: '#5d6b88',
    fontSize: 13,
    fontWeight: '600'
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e2c4f'
  }
});
