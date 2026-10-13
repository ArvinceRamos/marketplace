import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryChips } from "@/components/catalog/category-chips";
import { Results, ResultsSkeleton } from "@/components/catalog/results";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { findCategory, getCategories } from "@/lib/catalog";
import { parseFilters } from "@/lib/search-params";

type Props = PageProps<"/categories/[slug]">;

export default function CategoryPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Suspense fallback={<ResultsSkeleton />}>
          <CategoryContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function CategoryContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ slug }, raw, tree] = await Promise.all([params, searchParams, getCategories()]);
  const found = findCategory(tree, slug);
  if (!found) notFound();
  const { category, parent } = found;
  const siblings = parent ? parent.children : "children" in category ? category.children : [];
  const filters = { ...parseFilters(raw), category: slug };

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        {parent && (
          <nav aria-label="Breadcrumb" className="text-small text-fg-muted">
            <TextLink href={`/categories/${parent.slug}`}>{parent.name}</TextLink>
          </nav>
        )}
        <h1 className="text-heading lg:text-display">{category.name}</h1>
      </Stack>
      {siblings.length > 0 && (
        <CategoryChips categories={siblings} activeSlug={slug} label="Subcategories" />
      )}
      <Results action={`/categories/${slug}`} filters={filters} showCategory={false} />
    </Stack>
  );
}
