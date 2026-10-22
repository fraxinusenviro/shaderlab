/** Hand a shader (with possibly tweaked values) from the Viewer/Landscape views to the editor. */
import { navigate } from '../hooks/useHashRoute';
import type { ParamValue, ShaderProject } from '../types/shader';
import { toast } from './ui';
import { useWorkspace } from './workspace';

export async function openInEditor(project: ShaderProject, values?: Record<string, ParamValue>): Promise<void> {
  const ws = useWorkspace.getState();
  if (ws.dirty && ws.project && ws.project.id !== project.id && !confirm(`"${ws.project.name}" has unsaved changes in the editor. Replace it?`)) return;
  const tweaked = values && JSON.stringify(values) !== JSON.stringify(project.values);
  const p = tweaked ? { ...project, values: { ...project.values, ...values } } : project;
  // Navigate first so the editor viewport mounts, then load the project into it.
  navigate('workspace', p.id);
  await ws.openProject(structuredClone(p), { keepDirty: !!tweaked });
  if (tweaked) toast('info', 'Opened with your adjusted parameters (unsaved).');
}
