import { apiJson } from '@/lib/apiClient';
import type {
  AvailabilityResponse,
  BookingConfirmationInput,
  PractitionerAvailabilitySlotInput,
  SessionRequestInput,
} from '@/types/commerce';

export async function fetchPractitionerAvailability(practitionerUserId: string, date: string) {
  return apiJson<AvailabilityResponse>(
    `/api/practitioners/${encodeURIComponent(practitionerUserId)}/availability?date=${encodeURIComponent(date)}`
  );
}

export async function savePractitionerAvailability(slots: PractitionerAvailabilitySlotInput[]) {
  return apiJson<{ slots: PractitionerAvailabilitySlotInput[] }>('/api/practitioners/me/availability', {
    method: 'PUT',
    body: JSON.stringify({ slots }),
  });
}

export async function createSessionRequest(payload: SessionRequestInput) {
  return apiJson<Record<string, unknown>>('/api/session-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmSessionBooking(payload: BookingConfirmationInput) {
  return apiJson<{
    booking: Record<string, unknown>;
    videoRoom: Record<string, unknown>;
    legacySessionId: string | null;
  }>('/api/session-bookings/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
