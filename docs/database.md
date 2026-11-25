# Base de datos

`supabase/migrations` reserva la ubicación de las migraciones versionadas. La configuración local, el catálogo inicial y las pruebas SQL se incorporarán en la etapa 3.

El modelo aprobado separa empresas, perfiles, membresías, sucursales, dispositivos, avisos, pagos y auditoría. Las relaciones entre entidades empresariales preservarán la pertenencia a la misma empresa. RLS delimitará las lecturas por empresa y sucursal, y `UNIQUE(device_id, event_id)` respaldará los reintentos idempotentes.
