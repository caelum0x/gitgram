'use client'

import { useCallback, useMemo, type ComponentType, type ReactNode } from 'react'
import {
  DndContext as RawDndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragEndEvent,
  type DndContextProps,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SortableMediaItem {
  /** Stable unique id for the item (the object URL preview works well). */
  id: string
  /** Image preview source. */
  src: string
}

interface SortableMediaGridProps {
  items: SortableMediaItem[]
  /** Called with the new ordering after a drag or keyboard reorder. */
  onReorder: (items: SortableMediaItem[]) => void
  /** Called with the id of an item to remove. */
  onRemove: (id: string) => void
}

// ---------------------------------------------------------------------------
// Single sortable tile
// ---------------------------------------------------------------------------

interface SortableTileProps {
  item: SortableMediaItem
  index: number
  total: number
  onRemove: (id: string) => void
}

function SortableTile({ item, index, total, onRemove }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 10 : undefined,
      opacity: isDragging ? 0.85 : 1,
    }),
    [transform, transition, isDragging],
  )

  return (
    <div ref={setNodeRef} style={style} className="relative aspect-square">
      {/* Drag handle — also the keyboard-reorder grip. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder image ${index + 1} of ${total}. Press space or enter, then use arrow keys.`}
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full bg-black/40 p-2 text-white opacity-0 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] group-hover:opacity-100 active:cursor-grabbing"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>

      {/* Remove button. */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove image ${index + 1}`}
        className="absolute right-1.5 top-1.5 z-20 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-error"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Order badge. */}
      <span className="absolute left-1.5 top-1.5 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {index + 1}
      </span>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt={`Selected image ${index + 1}`}
        className="h-full w-full rounded-lg object-cover"
        draggable={false}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const measuringConfig = {
  droppable: { strategy: MeasuringStrategy.Always },
}
const modifiers = [restrictToParentElement]

// @dnd-kit ships types compiled against a different @types/react major than
// this app, which makes TS reject DndContext as a JSX component. Re-type it
// against this app's React types (behaviour is identical at runtime).
const DndContext = RawDndContext as unknown as ComponentType<
  DndContextProps & { children?: ReactNode }
>

/**
 * Keyboard-accessible drag-to-reorder grid for selected composer images.
 * Adapted from munia's CreatePostSort/CreatePostSortItem to the product's
 * stack (object-URL previews, CSS-variable theme, no custom svg_components).
 */
export default function SortableMediaGrid({ items, onReorder, onRemove }: SortableMediaGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      onReorder(arrayMove(items, oldIndex, newIndex))
    },
    [items, onReorder],
  )

  const ids = useMemo(() => items.map((i) => i.id), [items])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={modifiers}
      measuring={measuringConfig}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item, index) => (
            <div key={item.id} className="group">
              <SortableTile item={item} index={index} total={items.length} onRemove={onRemove} />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
