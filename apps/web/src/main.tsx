import { Activity } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Falta el contenedor de la aplicación')

createRoot(root).render(
  <StrictMode>
    <main className="grid min-h-screen place-items-center px-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Activity aria-hidden="true" className="mb-5 size-8 text-violet-700" />
        <h1 className="text-3xl font-semibold tracking-tight">Yape Monitor</h1>
        <p className="mt-3 text-slate-600">La base del panel está lista para la integración.</p>
      </section>
    </main>
  </StrictMode>,
)
