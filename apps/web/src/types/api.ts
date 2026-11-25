export type Role = 'COMPANY_ADMIN' | 'MANAGER' | 'CASHIER'
export type RecordStatus = 'active' | 'inactive'
export type DeviceStatus = 'active' | 'pending' | 'revoked'
export type PaymentStatus = 'pending_verification' | 'verified'
export type EventStatus = 'received' | 'processed' | 'needs_review' | 'rejected' | 'processing_error'
export type Company = { id: string; name: string; legal_name: string | null; tax_id: string | null; status: RecordStatus }
export type Profile = { id: string; full_name: string | null; email: string | null; status: RecordStatus }
export type Membership = { id: string; company_id: string; profile_id: string; role: Role; status: RecordStatus }
export type Member = Membership & { full_name: string | null; email: string | null; branch_ids: string[] }
export type Identity = { profile: Profile; is_platform_admin: boolean; memberships: Membership[] }
export type Branch = { id: string; name: string; address: string | null; status: RecordStatus }
export type Device = {
  id: string; branch_id: string; name: string; device_identifier: string; status: DeviceStatus
  app_version: string | null; last_seen_at: string | null; paired_at: string | null; created_at: string
}
export type Payment = {
  id: string; sender_name: string | null; amount: string | null; currency: string | null
  received_at: string; payment_method: string | null; branch_name: string | null; device_name: string | null
  status: PaymentStatus; verification_source: string | null; verification_reference: string | null; verified_at: string | null
}
export type PaymentEvent = {
  id: string; event_id: string; event_type: string; processing_status: EventStatus; captured_at: string
  received_at: string; processed_at: string | null; payment_id: string | null; device_id: string; branch_id: string
}
export type PaymentDetails = Payment & { events: PaymentEvent[] }
export type Totals = {
  currency: string | null; detected_count: string; officially_verified_count: string
  detected_amount: string; officially_verified_amount: string
}
export type Summary = {
  from: string; to: string; timezone: string
  events_by_status: Partial<Record<EventStatus, string>>
  totals_by_currency: Totals[]
  all_time_notifications_count?: string
  devices_online_count: string
  devices_active_count: string
}
export type Audit = { id: string; action: string; entity_type: string; entity_id: string | null; actor_type: string; created_at: string }
export type Page<T> = { data: T[]; next_cursor: string | null }
export type Params = Record<string, string | number | undefined>
