export function handleInput(event: Event, inputValue: string) {
    const target = event.target as HTMLInputElement;
    inputValue = target.value;
    console.log(inputValue);
}