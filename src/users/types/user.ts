export interface User {
  id: string
  email: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  created_at: Date
  updated_at: Date
}
