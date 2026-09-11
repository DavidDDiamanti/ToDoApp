import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  title: string;
  hasChildren: boolean;
  onDeleteAll: () => void;
  onPromote: () => void;
  onCancel: () => void;
}

export function DeleteDialog({ title, hasChildren, onDeleteAll, onPromote, onCancel }: Props) {
  const heading = `Delete '${title}'?`;
  const secondary = { label: 'Cancel', onClick: onCancel };
  return hasChildren ? (
    <ConfirmDialog
      heading={heading}
      body="This item has children. What should happen to them?"
      primary={{ label: 'Delete children too', tone: 'danger', onClick: onDeleteAll }}
      extra={{ label: 'Keep children, move them up', onClick: onPromote }}
      secondary={secondary}
    />
  ) : (
    <ConfirmDialog
      heading={heading}
      body="It will be removed from your list."
      primary={{ label: 'Delete', tone: 'danger', onClick: onDeleteAll }}
      secondary={secondary}
    />
  );
}
