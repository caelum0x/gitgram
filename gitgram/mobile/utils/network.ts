import NetInfo from '@react-native-community/netinfo';

export const checkNetworkStatus = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
};

export const subscribeToNetworkChanges = (
  callback: (isConnected: boolean) => void
) => {
  return NetInfo.addEventListener((state) => {
    callback(state.isConnected ?? false);
  });
};

