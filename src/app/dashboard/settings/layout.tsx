import { SettingsSidebar } from './_components/settings-sidebar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0">
      <SettingsSidebar />
      <main className="flex-1 overflow-y-auto py-8 px-6">
        {children}
      </main>
    </div>
  )
}
