// Tenant management: hospital/clinic organizations and their configuration.
export { updateHospitalBranding } from './update-branding';
export type { UpdateHospitalBrandingInput } from './update-branding';
export { resolveCurrentHospital, resolveCurrentHospitalId, extractSubdomain } from './resolve-hospital';
export { onboardHospital } from './onboard-hospital';
export type { OnboardHospitalInput, OnboardHospitalResult } from './onboard-hospital';
