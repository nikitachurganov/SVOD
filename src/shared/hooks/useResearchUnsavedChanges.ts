import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { Modal } from 'antd';

export const BEFORE_WORKSPACE_CHANGE = 'research:before-workspace-change';

/** Protect both router navigation and workspace changes, which replace the page before routing. */
export function useResearchUnsavedChanges(dirty: boolean, saving: RefObject<boolean>) {
  const workspaceApproved = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving.current && !workspaceApproved.current && `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`);
  useBeforeUnload(useCallback((event) => {
    if (dirty && !saving.current) { event.preventDefault(); event.returnValue = ''; }
  }, [dirty, saving]));
  useEffect(() => {
    const guard = (event: Event) => {
      if (!dirty || saving.current) return;
      if (window.confirm('Есть несохранённая работа. Сменить пространство и потерять изменения?')) workspaceApproved.current = true;
      else event.preventDefault();
    };
    window.addEventListener(BEFORE_WORKSPACE_CHANGE, guard);
    return () => window.removeEventListener(BEFORE_WORKSPACE_CHANGE, guard);
  }, [dirty, saving]);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const modal = Modal.confirm({
      title: 'Оставить несохранённые изменения?',
      content: 'Работа ещё не сохранена. Останьтесь на странице, чтобы сохранить её.',
      okText: 'Уйти без сохранения', cancelText: 'Остаться',
      onOk: () => blocker.proceed(), onCancel: () => blocker.reset(),
    });
    return () => modal.destroy();
  }, [blocker]);
}
