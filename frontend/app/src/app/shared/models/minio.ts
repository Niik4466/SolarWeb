export type MinioObject = {
  name: string;
  size: number;
  last_modified?: string;
  Last_modified?: string;
};

export type MinioListResponse = {
  bucket: string;
  objects: MinioObject[];
};
