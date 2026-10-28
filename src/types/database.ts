export type DoseStatus =
  | 'programada'
  | 'pendiente'
  | 'confirmada'
  | 'pospuesta'
  | 'omitida'
  | 'sin_confirmar';

export interface UserProfile {
  id: string;
  nombre: string | null;
  telefono: string | null;
  zona_horaria: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface MedicationRow {
  id: string;
  usuario_id: string;
  nombre: string;
  presentacion: string;
  dosis_indicada: string;
  instrucciones: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface ScheduleRow {
  id: string;
  medicamento_id: string;
  hora: string;
  dias_semana: number[];
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface DoseRow {
  id: string;
  horario_id: string;
  programada_para: string;
  estado: DoseStatus;
  confirmada_en: string | null;
  pospuesta_hasta: string | null;
  creado_en: string;
  actualizado_en: string;
}

export type MedicationInsert = Partial<MedicationRow>;
export type ScheduleInsert = Partial<ScheduleRow>;
export type DoseInsert = Partial<DoseRow>;

type DbRow<T> = T & Record<string, unknown>;
type DbInsert<T> = Partial<T> & Record<string, unknown>;

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: DbRow<UserProfile>;
        Insert: DbInsert<UserProfile>;
        Update: DbInsert<UserProfile>;
        Relationships: [];
      };
      medicamentos: {
        Row: DbRow<MedicationRow>;
        Insert: DbInsert<MedicationRow>;
        Update: DbInsert<MedicationRow>;
        Relationships: [];
      };
      horarios: {
        Row: DbRow<ScheduleRow>;
        Insert: DbInsert<ScheduleRow>;
        Update: DbInsert<ScheduleRow>;
        Relationships: [];
      };
      dosis_programadas: {
        Row: DbRow<DoseRow>;
        Insert: DbInsert<DoseRow>;
        Update: DbInsert<DoseRow>;
        Relationships: [];
      };
      registros_tomas: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      estado_dosis: DoseStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

export interface MedicationWithSchedules extends MedicationRow {
  horarios: ScheduleRow[];
}

export interface DoseWithMedication extends DoseRow {
  horario: ScheduleRow;
  medicamento: MedicationRow;
  tieneRegistro?: boolean;
}
