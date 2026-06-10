"use client";

import { PhotoStrip } from "@/components/PhotoStrip";

export function RolePhotos({ productionId, roleId }: { productionId: string; roleId: string }) {
  return (
    <PhotoStrip
      endpoint={`/api/productions/${productionId}/roles/${roleId}/images`}
      max={6}
      label="Photos"
    />
  );
}
