export function createInputHandler({onInteraction}) {
    const updatePointerFromEvent = (event) => {
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        const pointer = { x: (clientX / window.innerWidth) * 2 - 1, y: -(clientY / window.innerHeight) * 2 + 1 };

        return pointer;
    };
    const handleMouseMove = (event) => {
        const pointer = updatePointerFromEvent(event);
        if (typeof onInteraction?.updatePointer === 'function') {
         onInteraction.updatePointer(pointer);
        }
    };

    const handleClick = () => {
        onInteraction?.handle();
    };

    const bind = () => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('click', handleClick);
    }
    return {bind, 
        handleMouseMove
    };
}