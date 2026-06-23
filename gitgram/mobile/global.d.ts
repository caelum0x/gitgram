import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }

  interface TextProps {
    className?: string;
  }

  interface ImageProps {
    className?: string;
  }

  interface ScrollViewProps {
    className?: string;
  }

  interface TextInputProps {
    className?: string;
  }

  interface ActivityIndicatorProps {
    className?: string;
  }

  interface TouchableOpacityProps {
    className?: string;
  }
}
