import MiniSearch, { type SearchResult } from "minisearch";
import { useCallback, useEffect, useMemo, useState } from "react";
import { miniSearchConfig } from "@shared/searchConfig";
import type { ChangeEvent } from "react";
import { throttle } from "lodash-es";
import Article, { type ContentWithChildren } from "./Article";

export default function ContentWithSearch({
  rows,
}: {
  rows: ContentWithChildren[];
}) {
  const [miniSearch, setMiniSearch] = useState<MiniSearch | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    async function loadSearch() {
      const resp = await fetch("/digest.index.json");
      const data = await resp.json();
      const miniSearch = MiniSearch.loadJS(data, miniSearchConfig);
      setMiniSearch(miniSearch);
    }
    loadSearch();
  }, []);

  const updateSearch = useCallback(
    (query: string) => {
      setResults(miniSearch?.search(query, { fuzzy: true }) ?? []);
    },
    [miniSearch]
  );

  const throttleUpdateSearch = useMemo(
    () => throttle(updateSearch, 100),
    [updateSearch]
  );

  const handleChangeQuery = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      const query = ev.currentTarget.value;
      if (query === "") {
        setResults(null);
        return;
      }
      if (!miniSearch) {
        return;
      }
      throttleUpdateSearch(query);
    },
    [throttleUpdateSearch]
  );

  const displayRows = results != null ? results.slice(0, 15) : rows;

  return (
    <>
      <div className="search">
        <input
          type="search"
          onChange={handleChangeQuery}
          placeholder="search posts"
        />
      </div>
      {displayRows.map(
        ({
          id,
          title,
          contentTimestamp,
          contentSummary,
          url,
          sourceId,
          sourceShortName,
          sourceURL,
          childContent,
        }) => (
          <Article
            key={id}
            id={id}
            title={title}
            contentTimestamp={contentTimestamp}
            contentSummary={contentSummary}
            url={url}
            sourceId={sourceId}
            sourceShortName={sourceShortName}
            sourceURL={sourceURL}
            childContent={childContent}
          />
        )
      )}
    </>
  );
}
