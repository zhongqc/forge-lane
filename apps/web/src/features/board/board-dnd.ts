import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
export const boardCollision: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const transitions = hits.filter((hit) => String(hit.id).startsWith('transition:'));
  if (transitions.length) return transitions;
  const cards = hits.filter((hit) => !String(hit.id).startsWith('column:'));
  if (cards.length) return cards;
  const column = hits.find((hit) => String(hit.id).startsWith('column:'));
  if (column && args.pointerCoordinates) {
    const columnId = String(column.id).slice(7);
    const nearby = args.droppableContainers
      .filter(
        (container) =>
          container.data.current?.kind === 'card' && container.data.current?.columnId === columnId,
      )
      .flatMap((container) => {
        const rect = args.droppableRects.get(container.id);
        return rect ? [{ id: container.id, rect }] : [];
      });
    const y = args.pointerCoordinates.y;
    if (
      y >= Math.min(...nearby.map((item) => item.rect.top)) &&
      y <= Math.max(...nearby.map((item) => item.rect.bottom))
    ) {
      nearby.sort(
        (a, b) => Math.abs(y - a.rect.top - a.rect.height / 2) - Math.abs(y - b.rect.top - b.rect.height / 2),
      );
      if (nearby[0]) return [{ id: nearby[0].id }];
    }
  }
  return hits;
};
// Navigate explicit card/empty-section targets, excluding the current target. The generic
// sortable getter can choose the current card again when nested sections share its bounds.
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const currentId = context.over?.id ?? context.active?.id;
  const current = currentId ? context.droppableRects.get(currentId) : context.collisionRect;
  if (!current) return;
  const containers = context.droppableContainers.getEnabled();
  const candidates = containers.flatMap((container) => {
    if (container.id === currentId) return [];
    if (
      container.data.current?.kind === 'column' &&
      containers.some(
        (card) =>
          card.data.current?.kind === 'card' &&
          card.data.current?.columnId === container.data.current?.columnId,
      )
    )
      return [];
    const rect = context.droppableRects.get(container.id);
    if (!rect) return [];
    const dx = rect.left + rect.width / 2 - current.left - current.width / 2;
    const dy = rect.top + rect.height / 2 - current.top - current.height / 2;
    const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown';
    const distance = horizontal ? dx : dy;
    if ((forward ? distance <= 1 : distance >= -1) || (!horizontal && Math.abs(dx) > current.width / 2))
      return [];
    return [{ rect, score: Math.abs(distance) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2 }];
  });
  candidates.sort((a, b) => a.score - b.score);
  const target = candidates[0]?.rect;
  return target ? { x: target.left, y: target.top } : undefined;
};
