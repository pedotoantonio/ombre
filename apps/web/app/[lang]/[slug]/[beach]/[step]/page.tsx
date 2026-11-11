import { AccountRoute, isAccountSection } from '@/components/account';
import { BookView, privateMetadata } from '@/components/beach';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = privateMetadata;

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach, step } = await params;
  const query = await searchParams;
  if (isAccountSection(lang, slug)) return <AccountRoute locale={lang} segments={[beach, step]} query={query} />;
  return <BookView lang={lang} section={slug} slug={beach} step={step} query={query} />;
}
