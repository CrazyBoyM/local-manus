import { GlobeIcon } from "lucide-react";
import { BrowseOperationDataResponse } from "../operation-panel";
import { OperationContainer } from "./operation-container";

interface BrowseOperationProps {
  data?: BrowseOperationDataResponse;
  url?: string;
}

export function BrowseOperation({ data, url }: BrowseOperationProps) {
  const displayUrl = data?.url || url || "";
  
  return (
    <OperationContainer 
      title={displayUrl}
      icon={<GlobeIcon className="h-4 w-4" />}
    >
      {data?.screenshot ? (
        <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <img 
            src={data.screenshot} 
            alt="网页截图"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <p className="text-gray-500">无可用截图</p>
        </div>
      )}
    </OperationContainer>
  );
} 