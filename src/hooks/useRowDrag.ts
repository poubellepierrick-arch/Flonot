import { useCallback, useState, type DragEvent } from 'react';

export interface RowDropIndicator {
  rowId: string;
  position: 'before' | 'after';
}

const ROW_DRAG_MIME = 'application/x-impro-row';

/**
 * Hook partagé pour réordonner les lignes d'un tableau par glisser-déposer sur poignée.
 * Utilise un type MIME dédié pour ne jamais interférer avec useColumnDrag.
 */
export function useRowDrag(
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
) {
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [rowDropIndicator, setRowDropIndicator] = useState<RowDropIndicator | null>(null);

  const handleRowDragStart = useCallback((rowId: string, e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    setDragRowId(rowId);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData(ROW_DRAG_MIME, rowId);
    } catch {
      // Ignore si restreint par l'environnement
    }
    const rowEl = e.currentTarget.closest('tr');
    if (rowEl && typeof e.dataTransfer.setDragImage === 'function') {
      try {
        e.dataTransfer.setDragImage(rowEl, 24, Math.min(20, Math.round(rowEl.offsetHeight / 2)));
      } catch {
        // Ignore si indisponible
      }
    }
  }, []);

  const handleRowDragOver = useCallback(
    (targetRowId: string, e: DragEvent<HTMLTableRowElement>) => {
      if (!dragRowId && !e.dataTransfer.types.includes(ROW_DRAG_MIME)) return;
      if (dragRowId === targetRowId) {
        if (rowDropIndicator?.rowId === targetRowId) setRowDropIndicator(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      setRowDropIndicator((prev) =>
        prev && prev.rowId === targetRowId && prev.position === position
          ? prev
          : { rowId: targetRowId, position }
      );
    },
    [dragRowId, rowDropIndicator]
  );

  const handleRowDrop = useCallback(
    (targetRowId: string, e: DragEvent<HTMLTableRowElement>) => {
      const mimeData = e.dataTransfer.getData(ROW_DRAG_MIME);
      const sourceId = dragRowId || mimeData;
      if (!sourceId) return;
      e.preventDefault();
      e.stopPropagation();
      if (sourceId !== targetRowId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const position: 'before' | 'after' =
          e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        onReorder(sourceId, targetRowId, position);
      }
      setDragRowId(null);
      setRowDropIndicator(null);
    },
    [dragRowId, onReorder]
  );

  const handleRowDragEnd = useCallback(() => {
    setDragRowId(null);
    setRowDropIndicator(null);
  }, []);

  const getTrDropProps = useCallback(
    (rowId: string) => ({
      onDragOver: (e: DragEvent<HTMLTableRowElement>) => handleRowDragOver(rowId, e),
      onDrop: (e: DragEvent<HTMLTableRowElement>) => handleRowDrop(rowId, e),
    }),
    [handleRowDragOver, handleRowDrop]
  );

  const getRowDragHandleProps = useCallback(
    (rowId: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => handleRowDragStart(rowId, e),
      onDragEnd: handleRowDragEnd,
    }),
    [handleRowDragStart, handleRowDragEnd]
  );

  return {
    dragRowId,
    rowDropIndicator,
    getTrDropProps,
    getRowDragHandleProps,
  };
}
