import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { FirebaseAuthProvider } from '@/lib/firebaseAuth';
import TodoApp from '@/pages/TodoApp';
import DesktopShell from '@/components/desktop/DesktopShell';
import { isDesktop } from '@/lib/desktop';

function App() {
  const app = (
    <FirebaseAuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/" element={<TodoApp />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </FirebaseAuthProvider>
  );
  // Windows-Desktop-App: App im ausfahrbaren Seiten-Panel
  return isDesktop ? <DesktopShell>{app}</DesktopShell> : app;
}

export default App;