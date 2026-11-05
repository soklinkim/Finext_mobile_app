import { Redirect } from 'expo-router';

/** Search now lives at the top of the entries history (Transactions); old links to /search land there. */
export default function Search() {
  return <Redirect href="/transactions" />;
}
