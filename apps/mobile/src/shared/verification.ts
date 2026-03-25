type ProfileLike = {
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  isVerified?: boolean;
};

export function hasMinimumProfileData(profile: ProfileLike | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  return Boolean(profile.firstName?.trim() && profile.lastName?.trim() && profile.phoneNumber?.trim());
}

export function canUseTransactionalFlows(profile: ProfileLike | null | undefined): boolean {
  return hasMinimumProfileData(profile) && profile?.isVerified === true;
}
