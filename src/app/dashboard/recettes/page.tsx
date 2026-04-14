import { redirect } from 'next/navigation'
export default function RecettesPage() {
  redirect('/dashboard/marchandise?tab=recettes')
}
