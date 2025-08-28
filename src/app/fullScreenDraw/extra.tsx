import { createContext, useContext } from 'react';
import { DrawCoreActionType } from './components/drawCore/extra';

export type DrawContextType = {
    getDrawCoreAction: () => DrawCoreActionType | undefined;
};

export const DrawContext = createContext<DrawContextType>({
    getDrawCoreAction: () => undefined,
});

export const useDrawContext = () => {
    const context = useContext(DrawContext);
    return context;
};
