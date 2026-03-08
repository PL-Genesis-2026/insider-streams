import { useContext } from "react";
import { PrivateDataContext } from "./private-data-provider";

export function usePrivateData() {
  const context = useContext(PrivateDataContext);
  if (!context) {
    throw new Error("usePrivateData must be used within a PrivateDataProvider");
  }
  return context;
}
