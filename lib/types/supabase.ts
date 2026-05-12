export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      [_ in string]: {
        Row: {
          [_ in string]: any
        }
        Insert: {
          [_ in string]: any
        }
        Update: {
          [_ in string]: any
        }
      }
    }
    Views: {
      [_ in string]: any
    }
    Functions: {
      [_ in string]: any
    }
    Enums: {
      [_ in string]: any
    }
    CompositeTypes: {
      [_ in string]: any
    }
  }
}
