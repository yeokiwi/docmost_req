import { Feature, FeatureKey } from './features';

/**
 * Features this build implements as open source. They are on for every
 * workspace without a license; anything else still needs one.
 */
export const OPEN_SOURCE_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  Feature.DOCX_IMPORT,
  Feature.PDF_IMPORT,
  Feature.COMMENT_RESOLUTION,
  Feature.TEMPLATES,
  Feature.PAGE_VERIFICATION,
  Feature.PERSONAL_SPACES,
  Feature.API_KEYS,
  Feature.AUDIT_LOGS,
  Feature.PAGE_PERMISSIONS,
  Feature.MFA,
]);
