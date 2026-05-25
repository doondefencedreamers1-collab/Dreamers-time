import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://muvpnatfdfuurrglafpn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_5fmVn2sNSvo_r_EjDuZXbw_LIHOuj3E'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
