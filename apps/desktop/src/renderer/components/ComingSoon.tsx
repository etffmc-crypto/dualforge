import { Card } from './Card';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="coming-soon">
      <Card title={title}>
        <p className="muted">{note}</p>
      </Card>
    </div>
  );
}
