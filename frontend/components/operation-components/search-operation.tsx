import { SearchIcon } from "lucide-react";
import { SearchOperationDataResponse } from "../operation-panel";
import { OperationContainer } from "./operation-container";

interface SearchOperationProps {
  data?: SearchOperationDataResponse;
  query?: string;
}

export function SearchOperation({ data, query }: SearchOperationProps) {
  // 显示实际的搜索关键词作为标题
  const searchQuery = data?.query || query || "Search";
  
  return (
    <OperationContainer 
      title={searchQuery}
      icon={<SearchIcon className="h-4 w-4" />}
    >
      <div className="p-4">
        {data?.results && data.results.length > 0 ? (
          <div className="space-y-6">
            {data.results.map((result) => (
              <div key={result.id} className="pb-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                <h4 className="text-blue-600 dark:text-blue-400 hover:underline text-lg font-medium cursor-pointer">
                  <a href={result.url} target="_blank" rel="noopener noreferrer">
                    {result.title}
                  </a>
                </h4>
                <p className="text-green-700 dark:text-green-500 text-xs mt-1">{result.url}</p>
                <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">{result.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">没有搜索结果</p>
          </div>
        )}
      </div>
    </OperationContainer>
  );
} 