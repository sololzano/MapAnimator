import { useEffect, useState } from 'react';
import { AboutPage } from './features/about/AboutPage';
import { Editor } from './features/editor/Editor';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { useApp } from './state/store';

/** Hash routes: "#/" = projects, "#/p/<id>" = editor, "#/about" = about. Works on any static host. */
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

const isAbout = () => location.hash.startsWith('#/about');

export default function App() {
  const ready = useApp((s) => s.ready);
  const open = useApp((s) => !!s.project);
  const theme = useApp((s) => s.uiTheme);
  const [about, setAbout] = useState(isAbout);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const onHash = () => { syncRoute(); setAbout(isAbout()); };
    void useApp.getState().load().then(syncRoute);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) return null;
  return open ? <Editor /> : about ? <AboutPage /> : <ProjectsPage />;
}
