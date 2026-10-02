import { useEffect } from 'react';
import { Editor } from './features/editor/Editor';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { useApp } from './state/store';

/** Hash routes: "#/" = projects, "#/p/<id>" = editor. Works on any static host. */
function syncRoute() {
  const m = /^#\/p\/([\w-]+)/.exec(location.hash);
  const st = useApp.getState();
  if (m) {
    if (st.project?.id !== m[1]) {
      if (st.projects.some((p) => p.id === m[1])) st.openProject(m[1]);
      else location.hash = '#/';
    }
  } else if (st.project) st.closeProject();
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const open = useApp((s) => !!s.project);
  const theme = useApp((s) => s.uiTheme);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    void useApp.getState().load().then(syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  if (!ready) return null;
  return open ? <Editor /> : <ProjectsPage />;
}
