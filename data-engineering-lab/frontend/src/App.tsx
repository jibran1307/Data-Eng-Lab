import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import { useStore } from './lib/store'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Learn = lazy(() => import('./pages/Learn'))
const Lesson = lazy(() => import('./pages/Lesson'))
const SqlLab = lazy(() => import('./pages/SqlLab'))
const PythonLab = lazy(() => import('./pages/PythonLab'))
const Projects = lazy(() => import('./pages/Projects'))
const Exercises = lazy(() => import('./pages/Exercises'))
const Interviews = lazy(() => import('./pages/Interviews'))
const Scenarios = lazy(() => import('./pages/Scenarios'))
const Assessments = lazy(() => import('./pages/Assessments'))
const Progress = lazy(() => import('./pages/Progress'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  const { ready } = useStore()
  if (!ready) return <div className="p-8"><PageSkeleton /></div>
  return (
    <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="learn" element={<Learn />} />
          <Route path="learn/:id" element={<Lesson />} />
          <Route path="sql" element={<SqlLab />} />
          <Route path="python" element={<PythonLab />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<Projects />} />
          <Route path="exercises" element={<Exercises />} />
          <Route path="interviews" element={<Interviews />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="assessments" element={<Assessments />} />
          <Route path="progress" element={<Progress />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<div className="py-20 text-center text-muted">Page not found.</div>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
