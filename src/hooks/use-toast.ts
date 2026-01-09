import { useContext, createContext } from 'react';

interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastContextType {
  toast: (props: ToastProps) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  
  // Fallback to console.log if no toast provider
  if (!context) {
    return {
      toast: (props: ToastProps) => {
        if (props.variant === 'destructive') {
          console.error(`${props.title}: ${props.description || ''}`);
        } else {
          console.log(`${props.title}: ${props.description || ''}`);
        }
      }
    };
  }
  
  return context;
}