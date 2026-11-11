import { HoldView, privateMetadata } from '@/components/beach';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string; hold: string }>;
}

export const metadata = privateMetadata;

export default async function Page({ params }: Props) {
  const { lang, slug, beach, step, hold } = await params;
  return <HoldView lang={lang} section={slug} slug={beach} step={step} holdId={hold} />;
}
