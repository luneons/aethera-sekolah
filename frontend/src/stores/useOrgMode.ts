'use client';

import { getTerminology, type OrgMode, type Terminology } from '@/lib/terminology';

/**
 * Hook to access organization terminology.
 *
 * Mode SELALU 'school' — aplikasi ini fokus untuk konteks sekolah.
 * Hook tetap dipertahankan supaya komponen lama yang pakai `t.*`
 * tidak perlu diubah.
 */
export function useOrgMode() {
  const mode: OrgMode = 'school';
  const t: Terminology = getTerminology(mode);

  return {
    mode,
    t,
    isSchool: true as const,
    isOffice: false as const,
    isLoading: false,
    isError: false,
  };
}
